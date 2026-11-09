/* global after, before, describe, it, assert, Zotero, Services, Components */

// Shared helpers for the suite (survey 2026-10-06 §6, step 5). Every spec
// file is a <script> in ONE runner page, so a global defined here, in the
// first file the bundler stages (000-), is in scope for all of them:
// `wvT.<helper>` replaces the per-file copies (~25 sleep / 10 waitFor /
// 7 minimalPDFBytes before). Specs stay self-contained in the sense the
// targeted runner needs (no relative imports) -- a global, not a module.
//
// Skip discipline (same survey): a missing plugin, method or constant is a
// FAILURE (`wvT.absent`), never a skip -- 163 guards used to skip exactly
// when the regression happened, and nothing counted pending tests.
// `this.skip()` is for platform / version / runner reasons only, and
// every pending test must match the allowlist below (reason included):
// the root `after` hook fails the run on any other.

(function () {
    const tempFiles = [];

    const wvT = {
        /** The live plugin, or null. */
        plugin() { return (Zotero.Weavero && Zotero.Weavero.plugin) || null; },
        /** On CI only, up to `n` more attempts for a test known to flake
         *  there (call with the test's or the suite's `this`), as Zotero's
         *  runner retries (`runtests.sh -r 3`; the 2026-11-03 study,
         *  recommendation 3). Every retry is logged ("[wv-test] retry", the
         *  root afterEach below) and counted in the run's closing line. Keep
         *  the list short: a retry can hide a real intermittent bug unless
         *  the log is read. A hook's failure is never retried. */
        ciRetries(ctx, n = 2) {
            try { if (Services.env.exists("CI") && ctx && typeof ctx.retries === "function") ctx.retries(n); } catch (e) {}
        },
        /** Titles of the tests that needed a retry in this run. */
        retried: [],
        /** A Zotero with its own windows (zotero#6035, lib/windows.ts). */
        nativeWindows() { return typeof /** @type {any} */ (Zotero).Prefs.setForWindow === "function"; },
        /** A further main window, ready for use: Zotero's own where it has
         *  them, else Weavero's spawn. Null on timeout. */
        async openMainWindow(timeoutMs) {
            const win = Zotero.getMainWindow(), ms = timeoutMs || 25000;
            if (wvT.nativeWindows()) {
                const before = Zotero.getMainWindows();
                win.ZoteroPane.newWindow();
                return wvT.waitFor(() => {
                    const w = Zotero.getMainWindows().find(x => !before.includes(x));
                    return (w && w.ZoteroPane && w.ZoteroPane.itemsView) ? w : null;
                }, ms);
            }
            const wv = wvT.plugin();
            const s = wv._wvSpawnMainWindowStart();
            return wv._wvSpawnMainWindowWait(s, { wait: "init", timeoutMs: ms, timerWin: win, dropOnTimeout: true });
        },
        /** What stands down on a Zotero with its own windows (zotero#6035):
         *  the specs of Weavero's extra windows, reader windows and window
         *  store, by full title. Marked pending there, before their hooks can
         *  run; everywhere else they run as ever. Bring an entry back with its
         *  feature. */
        NATIVE_RETIRED: [
            /^Weavero — the main window reopens on its own collection/,
            /^Weavero — the background-restore focus guard ends/,
            /^Weavero — cross-window multi-tab moves keep the selection/,
            /^Weavero — a library-only main window comes back after a restart/,
            /^Weavero — a note in a reader window is wired once its editor is ready/,
            /^Weavero — a note's deck anchor is never/,
            /^Weavero — a reader window's item pane follows/,
            /^Weavero — reader tear-off \/ merge-back lifecycle/,
            /^Weavero — pinned section and open sections per main window/,
            /^Weavero — per-main-window wiring, characterized/,
            /^Weavero — cross-window drop records its effect/,
            /^Weavero — reader and note window wiring, characterized/,
            /^Weavero — item drags onto notes in reader and note windows/,
            /^Weavero — the Tag Selector survives a second main window closing/,
            /^Weavero — File \/ Edit menubar entries for the window commands/,
            /^Weavero — new main window: one spawn sequence/,
            /^Weavero — the anchor mark follows the window count when a window closes a reader window/,
            /^Weavero — hidden collections \(per window\) (Manage Hidden|a NEW main window gets its own set)/,
            /^Weavero — hidden collections \(per window\) the window store carries/,
            /^Weavero — open a collection in a new window; right-click keeps the selection (middle-click on a row|middle-click on the Advanced Search funnel|the context menu carries Open in New Window|the new window lands)/,
            /^Weavero — View → Layout follows the tab \(zotero#2814\) a separate reader window/,
            /^Weavero — pref getters \(characterization\) every getter answers/,
            /^Weavero — custom window titles live in the window's state the window store carries/,
            /^Weavero — wire stamps are build-keyed \(hot-upgrade rewiring\) Reader\.getWindowStates/,
        ],
        /** The shared helpers the plugin publishes (src/lib), or null. */
        lib() { return (Zotero.Weavero && Zotero.Weavero.lib) || null; },
        win() { return Zotero.getMainWindow(); },

        /** Fail loudly: a plugin surface a spec needs is not there. */
        absent(what) {
            throw new Error("Weavero surface absent: " + what
                + " -- a regression or a rename, not a reason to skip");
        },
        /** Present the Reading List plugin as active; returns the restore.
         *  Read Status is DORMANT without it (survey 3.5, MJT 2026-10-13)
         *  and the runner has none, so a spec that characterizes the
         *  dimension itself stubs it on. */
        readingListOn() {
            const p = wvT.plugin();
            if (!p) wvT.absent("plugin");
            const own = Object.prototype.hasOwnProperty.call(p, "_wvReadingListActive");
            const orig = p._wvReadingListActive;
            p._wvReadingListActive = () => true;
            return () => { if (own) p._wvReadingListActive = orig; else delete p._wvReadingListActive; };
        },
        /** The plugin method `name`, or a failure. */
        method(name) {
            const p = wvT.plugin();
            if (!p) wvT.absent("plugin");
            if (typeof p[name] !== "function") wvT.absent("plugin." + name);
            return p[name];
        },
        /** A plugin method's source, for source contracts. */
        src(name) { return String(wvT.method(name)); },

        sleep(ms) { return new Promise(r => setTimeout(r, ms)); },
        /** Poll `cb` until truthy (its value) or `timeout` ms (null). */
        async waitFor(cb, timeout = 15000, interval = 150) {
            const start = Date.now();
            for (;;) {
                let v = null;
                try { v = cb(); } catch (e) {}
                if (v) return v;
                if (Date.now() - start > timeout) return null;
                await wvT.sleep(interval);
            }
        },

        /** Run `fn` with the weavero pref `key` set to `value`, then put the
         *  pref back the way it was: a user value is restored, a defaulted
         *  pref is cleared (never written as a user value), and a pref with
         *  neither keeps the test's value -- Zotero.Prefs.set cannot recreate
         *  a cleared pref that has no default (NS_ERROR_UNEXPECTED until
         *  restart), which would break every later spec touching it. */
        async withPref(key, value, fn) {
            const B = Services.prefs.getBranch("extensions.zotero.");
            const D = Services.prefs.getDefaultBranch("extensions.zotero.");
            const hadUser = B.prefHasUserValue(key);
            const had = Zotero.Prefs.get(key);
            try {
                Zotero.Prefs.set(key, value);
                return await fn();
            }
            finally {
                try {
                    if (hadUser) Zotero.Prefs.set(key, had);
                    else if (D.getPrefType(key) !== D.PREF_INVALID) Zotero.Prefs.clear(key);
                    else if (had !== undefined) Zotero.Prefs.set(key, had);
                } catch (e) {}
            }
        },

        /** A one-page PDF with correct xref offsets, so pdf.js opens it
         *  without recovery heuristics. No text content. */
        minimalPDFBytes() {
            const objs = [
                "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
                "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
                "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] >>\nendobj\n",
            ];
            let body = "%PDF-1.4\n";
            const offsets = [];
            for (const o of objs) { offsets.push(body.length); body += o; }
            const xrefPos = body.length;
            let xref = "xref\n0 4\n0000000000 65535 f \n";
            for (const off of offsets) xref += String(off).padStart(10, "0") + " 00000 n \n";
            const trailer = "trailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n" + xrefPos + "\n%%EOF\n";
            return body + xref + trailer;
        },
        /** Import that PDF as a standalone attachment (the temp file is
         *  removed at the end of the run). Returns the attachment item. */
        async createTestPDFItem(name, opts) {
            const path = PathUtils.join(PathUtils.tempDir, (name || "wv-test") + "-" + Date.now() + ".pdf");
            await IOUtils.writeUTF8(path, wvT.minimalPDFBytes());
            tempFiles.push(path);
            const file = Zotero.File.pathToFile(path);
            const att = await Zotero.Attachments.importFromFile(Object.assign({ file }, opts || {}));
            return att;
        },
        /** A small HTML page (a snapshot fixture): headings, paragraphs, an
         *  anchor -- ASCII only. */
        minimalSnapshotHTML(title) {
            const t = title || "WV-TEST snapshot";
            return "<!DOCTYPE html>\n<html><head><meta charset=\"utf-8\"><title>" + t + "</title></head>\n<body>\n"
                + "<h1 id=\"h1\">" + t + "</h1>\n"
                + "<p id=\"p1\">WV-TEST first paragraph: the quick brown fox jumps over the lazy dog, again and again, so that the line has some width to anchor to.</p>\n"
                + "<h2 id=\"h2\">Second heading</h2>\n"
                + "<p id=\"p2\">WV-TEST second paragraph with an <a href=\"https://example.com/wv\">example link</a> and more words after it.</p>\n"
                + "<p id=\"p3\">WV-TEST third paragraph.</p>\n"
                + "</body></html>\n";
        },
        /** Import that page as a standalone snapshot attachment (contentType
         *  text/html -> reader type "snapshot"). */
        async createTestSnapshotItem(name, opts) {
            const path = PathUtils.join(PathUtils.tempDir, (name || "wv-test") + "-" + Date.now() + ".html");
            await IOUtils.writeUTF8(path, wvT.minimalSnapshotHTML((name || "WV-TEST") + " snapshot"));
            tempFiles.push(path);
            const file = Zotero.File.pathToFile(path);
            return Zotero.Attachments.importFromFile(Object.assign({ file }, opts || {}));
        },
        /** The entries of a two-chapter EPUB 3 (path, text, compress), ASCII only.
         *  @returns {Array<[string, string, boolean]>} */
        minimalEPUBParts(title) {
            const t = title || "WV-TEST EPUB";
            const xhtml = (id, h, body) => "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n"
                + "<html xmlns=\"http://www.w3.org/1999/xhtml\" xmlns:epub=\"http://www.idpf.org/2007/ops\"><head><title>" + h + "</title></head>\n"
                + "<body><section id=\"" + id + "\"><h1 id=\"" + id + "-h\">" + h + "</h1>\n" + body + "</section></body></html>\n";
            return [
                ["mimetype", "application/epub+zip", false],
                ["META-INF/container.xml", "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n"
                    + "<container version=\"1.0\" xmlns=\"urn:oasis:names:tc:opendocument:xmlns:container\">\n"
                    + "<rootfiles><rootfile full-path=\"OEBPS/content.opf\" media-type=\"application/oebps-package+xml\"/></rootfiles>\n</container>\n", true],
                ["OEBPS/content.opf", "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n"
                    + "<package xmlns=\"http://www.idpf.org/2007/opf\" version=\"3.0\" unique-identifier=\"uid\">\n"
                    + "<metadata xmlns:dc=\"http://purl.org/dc/elements/1.1/\">\n"
                    + "<dc:identifier id=\"uid\">urn:uuid:wv-test-epub-" + Date.now() + "</dc:identifier>\n"
                    + "<dc:title>" + t + "</dc:title>\n<dc:language>en</dc:language>\n"
                    + "<meta property=\"dcterms:modified\">2026-10-08T00:00:00Z</meta>\n</metadata>\n"
                    + "<manifest>\n<item id=\"nav\" href=\"nav.xhtml\" media-type=\"application/xhtml+xml\" properties=\"nav\"/>\n"
                    + "<item id=\"ch1\" href=\"ch1.xhtml\" media-type=\"application/xhtml+xml\"/>\n"
                    + "<item id=\"ch2\" href=\"ch2.xhtml\" media-type=\"application/xhtml+xml\"/>\n</manifest>\n"
                    + "<spine>\n<itemref idref=\"ch1\"/>\n<itemref idref=\"ch2\"/>\n</spine>\n</package>\n", true],
                ["OEBPS/nav.xhtml", "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n"
                    + "<html xmlns=\"http://www.w3.org/1999/xhtml\" xmlns:epub=\"http://www.idpf.org/2007/ops\"><head><title>Contents</title></head>\n"
                    + "<body><nav epub:type=\"toc\" id=\"toc\"><h1>Contents</h1><ol>\n"
                    + "<li><a href=\"ch1.xhtml\">Chapter One</a></li>\n<li><a href=\"ch2.xhtml\">Chapter Two</a></li>\n"
                    + "</ol></nav></body></html>\n", true],
                ["OEBPS/ch1.xhtml", xhtml("ch1", "Chapter One",
                    "<p id=\"c1p1\">WV-TEST chapter one, first paragraph: the quick brown fox jumps over the lazy dog, again and again, so that the line has some width to anchor to.</p>\n"
                    + "<p id=\"c1p2\">WV-TEST chapter one, second paragraph.</p>\n"), true],
                ["OEBPS/ch2.xhtml", xhtml("ch2", "Chapter Two",
                    "<p id=\"c2p1\">WV-TEST chapter two, first paragraph.</p>\n"), true],
            ];
        },
        /** Write that EPUB (nsIZipWriter; `mimetype` first and stored) and
         *  import it as a standalone attachment (reader type "epub"). */
        async createTestEPUBItem(name, opts) {
            const Cc = Components.classes, Ci = Components.interfaces;
            const path = PathUtils.join(PathUtils.tempDir, (name || "wv-test") + "-" + Date.now() + ".epub");
            const file = Zotero.File.pathToFile(path);
            const zw = Cc["@mozilla.org/zipwriter;1"].createInstance(Ci.nsIZipWriter);
            zw.open(file, 0x04 | 0x08 | 0x20);   // PR_RDWR | PR_CREATE_FILE | PR_TRUNCATE
            try {
                for (const [p, text, compress] of wvT.minimalEPUBParts((name || "WV-TEST") + " EPUB")) {
                    const ss = Cc["@mozilla.org/io/string-input-stream;1"].createInstance(Ci.nsIStringInputStream);
                    // `setData` is gone from scriptable nsIStringInputStream in
                    // current Gecko; the content is ASCII, so either newer setter is exact.
                    if (typeof ss.setUTF8Data === "function") ss.setUTF8Data(text);
                    else if (typeof ss.setByteStringData === "function") ss.setByteStringData(text);
                    else ss.setData(text, text.length);
                    zw.addEntryStream(p, Date.now() * 1000, compress ? Ci.nsIZipWriter.COMPRESSION_DEFAULT : Ci.nsIZipWriter.COMPRESSION_NONE, ss, false);
                }
            }
            finally { zw.close(); }
            tempFiles.push(path);
            return Zotero.Attachments.importFromFile(Object.assign({ file }, opts || {}));
        },

        /** Open `itemID` in a reader tab of the main window and wait for its
         *  reader (internal reader + iframe window). Null on timeout. */
        async openReaderTab(itemID, timeout) {
            await Zotero.Reader.open(itemID, null, { allowDuplicate: false });
            return wvT.waitFor(() => (Zotero.Reader._readers || []).find(x => {
                try { return x.itemID === itemID && x._internalReader && x._iframeWindow; } catch (e) { return false; }
            }) || null, timeout || 30000);
        },
        /** A DOM view (snapshot / EPUB) once its content document holds
         *  `text`: the reader's primary view, Xray-waived (its fields are
         *  content-side objects). Null on timeout. */
        async domViewOf(reader, text, timeout) {
            const Cu = Components.utils;
            return wvT.waitFor(() => {
                try {
                    const ir = Cu.waiveXrays(reader._internalReader);
                    const pv = ir && ir._primaryView;
                    const d = pv && pv._iframeDocument;
                    if (!d || !d.body) return null;
                    if (text && !String(d.body.textContent || "").includes(text)) return null;
                    return pv;
                } catch (e) { return null; }
            }, timeout || 30000);
        },
        closeReaderTab(reader) {
            try {
                const w = reader && reader._window;
                const Z = w && w.Zotero_Tabs;
                if (Z && reader.tabID) Z.close(reader.tabID);
            } catch (e) {}
        },

        /** A saved item of `type` with `fields` set, in the user library. */
        async createItem(type, fields) {
            const it = new Zotero.Item(type || "journalArticle");
            it.libraryID = Zotero.Libraries.userLibraryID;
            for (const k of Object.keys(fields || {})) it.setField(k, fields[k]);
            await it.saveTx();
            return it;
        },
        /** Erase items, ignoring ones already gone. */
        async erase(...items) {
            for (const it of items) { try { if (it) await it.eraseTx(); } catch (e) {} }
        },

        /** Drop readers whose window is gone from Zotero.Reader._readers
         *  (a previous spec's plain window close can leave one for a beat;
         *  the natives deref its dead iframe). */
        purgeDeadReaders() {
            try {
                const rs = (Zotero.Reader && Zotero.Reader._readers) || [];
                for (let i = rs.length - 1; i >= 0; i--) {
                    let dead = false;
                    try { const r = rs[i]; dead = !r || !r._window || r._window.closed; }
                    catch (e) { dead = true; }
                    if (dead) rs.splice(i, 1);
                }
            } catch (e) {}
        },

        /** Wait (bounded) until no reader / note window and no second main
         *  window is open or closing, and the first window has dropped its
         *  anchor mark: the anchor class and icon names follow the window
         *  count, so a window an earlier spec closed late shows up in a later
         *  spec's wiring snapshot (checkpoints c7-c9, 2026-10-13). */
        async settleSecondaryWindows() {
            const open = () => {
                let n = 0;
                for (const t of ["zotero:reader", "zotero:note"]) {
                    const en = Services.wm.getEnumerator(t);
                    while (en.hasMoreElements()) { const w = /** @type {any} */ (en.getNext()); if (w && !w.closed) n++; }
                }
                try { n += Math.max(0, Zotero.getMainWindows().filter(w => !w.closed).length - 1); } catch (e) {}
                return n;
            };
            const anchored = () => { try { return Zotero.getMainWindow().document.documentElement.classList.contains("wv-anchor-window"); } catch (e) { return false; } };
            for (let i = 0; i < 80 && open(); i++) await wvT.sleep(100);
            for (let i = 0; i < 50 && anchored(); i++) await wvT.sleep(100);
            await wvT.sleep(1000);
        },

        /** Everything Weavero left on main window `w`, as sorted strings per
         *  host: its own `_wv*` expandos (with typeof), those of its Zotero
         *  objects and key elements plus their wvWrap layers, its `wv-` ids,
         *  root classes and attributes (test/window-wiring.spec.js). */
        wiringSnapshot(w) {
            const lib = wvT.lib();
            const VOLATILE = wvT.WIRING_VOLATILE;
            // Keyed listeners (lib/listen.ts) are recorded by key, not as
            // the bare `_wvListen` table.
            const keys = (o) => {
                try { return Object.getOwnPropertyNames(o).filter(n => /^_wv|^_weavero|^wv/.test(n) && n !== "_wvListen" && !VOLATILE.has(n)).sort(); }
                catch (e) { return ["<err>"]; }
            };
            const layers = (host) => {
                // (`boot:` keys: the startup shepherd, runtime state like
                // WIRING_VOLATILE.)
                const out = lib.wvListenKeys(host).filter(k => !k.key.startsWith("boot:")).map(k => "listen " + k.key).sort();
                try {
                    const ww = host && host._wvWraps;
                    if (ww) for (const m of Object.keys(ww).sort()) out.push("wrap " + m + ":" + lib.wvWrapLayers(host, m).map(l => l.layer).join("+"));
                } catch (e) { out.push("wrap <err>"); }
                return out;
            };
            const doc = w.document;
            const ZP = w.ZoteroPane;
            const iv = ZP && ZP.itemsView;
            const out = {};
            out.window = keys(w).map(k => k + ":" + typeof w[k]).concat(layers(w));
            const hosts = {
                ZoteroPane: ZP, Zotero_Tabs: w.Zotero_Tabs, itemsView: iv, rowProvider: iv && iv.rowProvider,
                collectionsView: ZP && ZP.collectionsView, itemPane: ZP && ZP.itemPane, document: doc,
                documentElement: doc.documentElement,
            };
            for (const [name, h] of Object.entries(hosts)) {
                out[name] = h ? keys(h).filter(k => k !== "_wvWraps").concat(layers(h)) : ["<absent>"];
            }
            for (const id of wvT.WIRING_ELEMENT_IDS) {
                const el = doc.getElementById(id);
                if (!el) continue;
                const k = keys(el).filter(x => x !== "_wvWraps").concat(layers(el));
                if (k.length) out["#" + id] = k;
            }
            out.ids = [...doc.querySelectorAll("[id^='wv-']")].map(e => e.id).sort();
            const de = doc.documentElement;
            out.rootClasses = [...de.classList].filter(c => c.startsWith("wv-")).sort();
            out.rootAttrs = [...de.attributes].map(a => a.name).filter(n => /^(wv|data-wv)/.test(n)).sort();
            return out;
        },
        /** Runtime STATE, not wiring, left out of the wiring snapshots: it
         *  varies with timing and with what earlier specs did, so the full
         *  suite and a targeted run differ. */
        WIRING_VOLATILE: new Set([
            // The startup background-restore shepherd: it hooks windows
            // opened while it is alive (a short targeted run: yes; deep
            // in the full suite: no) and records the user's claim.
            "_wvBgUserClaimed", "_wvBgClaimWired", "_wvBgArmed", "_wvBgHooked", "_wvBgOpenGrace",
            // Its self-raise mark: there only on a window whose reader opened
            // while the guard ran (_wvBgMarkReaderLoad), so timing too.
            "_wvBgExpectStealUntil",
            // Taskbar-overlay residency (one window per monitor issues
            // the badge; which one depends on focus history).
            "_wvOvFirstSetDone", "_wvOvFocusSeq", "_wvOvResidMon", "_wvOverlayName", "_wvOvPoison",
            // The overlay's settling check: a timer until the window's place
            // is stable, then a flag. Which one a snapshot sees is timing: a
            // slow runner was still on the timer (Windows, Zotero release).
            "_wvOvSettled", "_wvOvSettleTimer",
            // The window's last real geometry, cached at each store save
            // (`_wvWindowGeom`): present once a save ran, whatever the wiring.
            "_wvLastGeom",
            // A collection context-menu action's highlight (set, then null):
            // gesture state, there only after an earlier spec used the menu.
            "_wvCollAfterglow",
        ]),
        /** A wiring recording made platform- and theme-neutral, for the
         *  characterizations recorded on Windows in dark mode: the 0.22.0
         *  release CI (Linux, light) lacked exactly these and nothing else.
         *  Off Windows, drop the Windows-only wiring (taskbar overlay badge,
         *  per-window icons, the Ctrl+Y redo key -- each gated on
         *  Zotero.isWin); everywhere, drop the theme class `wv-ui-dark` and
         *  name the platform's Exit item (menu_fileQuitItemWin / -Unix) one
         *  way. Applied to the recording AND the expectation; a Windows run
         *  still checks the Windows-only keys. */
        wiringNormalize(rec) {
            const winOnly = /^(_wvOv|_wvPrevWinIcons|_wvWinIconName|_wvRedoKeyH)|^listen ovFollow:/;
            // The item pane's section state, there once Zotero has rendered
            // a window's Item Links / Backlinks sections -- a lazy render
            // (itemDetails asyncRender, while in view): the section menu's
            // "Reset Filters to Default" and its separator, and the window's
            // header filter. Wired on the 1.0.0-beta.1 CI's Windows runner,
            // not yet on the machine that recorded (2026-11-03); pane-scope.
            // spec.js holds both.
            const lazyPane = /^(wv-scope-menu-(reset|sep)( x\d+)?|_wvScopeFilters:object|_wvOvSettled:boolean)$/;
            const fixStr = (s) => typeof s === "string" ? s.replace(/menu_fileQuitItem(Win|Unix)/g, "menu_fileQuitItem") : s;
            const keep = (s) => typeof s !== "string"
                || !(/^wv-ui-dark( x\d+)?$/.test(s) || lazyPane.test(s) || (!Zotero.isWin && winOnly.test(s)));
            const walk = (v) => {
                if (Array.isArray(v)) return v.filter(keep).map(fixStr).map(walk);
                if (v && typeof v === "object") {
                    const o = {};
                    for (const k of Object.keys(v)) o[fixStr(k)] = walk(v[k]);
                    return o;
                }
                return v;
            };
            return walk(rec);
        },
        WIRING_ELEMENT_IDS: ["zotero-itemmenu", "zotero-collectionmenu", "zotero-tabs-menu-panel", "item-tree-main-default",
            "zotero-collections-tree", "tab-bar-container", "zotero-items-pane", "zotero-item-pane", "zotero-context-pane",
            "zotero-collections-pane", "zotero-tb-search", "zotero-items-toolbar", "zotero-collections-toolbar",
            "zotero-title-bar", "main-window", "zotero-layout-switcher", "menu_EditPopup", "menu_FilePopup"],
        /** The main window's snapshot taken before any spec ran (root
         *  `before` below): what init / onMainWindowLoad wired, untouched by
         *  the specs' own clicks and popups. */
        mainAtStart: null,

        /** Pending tests this run may legitimately have, by full title. */
        PENDING_ALLOWLIST: [
            { re: /^Weavero — plugin compat: /, why: "companion plugin not installed in this run (npm run test:compat installs it)" },
            { re: /^Weavero — native windows \(zotero#6035\) on a real native build/, why: "version: needs a Zotero with its own windows" },
            { re: /^Weavero — Advanced Search in New Window on a Zotero with its own windows real windows/, why: "version: needs a Zotero with its own windows" },
            { re: /^Weavero — a window keeps its colour \(zotero#6035\) on a real native build/, why: "version: needs a Zotero with its own windows" },
            { re: /^Weavero — each window keeps its own pane widths on a real native build/, why: "version: needs a Zotero with its own windows" },
            { re: /^Weavero — the first window's place comes back without a store entry the restart puts it back/, why: "version: Weavero's own restart, an older Zotero (Zotero restores each of its own windows)" },
            { re: /^Weavero — the saved windows move to Zotero's own \(zotero#6035\) on a real native build/, why: "version: needs a Zotero with its own windows" },
            { re: /^Weavero — saved windows and group moves on Zotero's windows \(zotero#6035\) on a real native build/, why: "version: needs a Zotero with its own windows" },
            { re: /^Weavero — named sessions on Zotero's windows \(zotero#6035\)/, why: "version: needs a Zotero with its own windows" },
            { re: /^Weavero — the filter in every library tab \(zotero#6035\)/, why: "version: needs a Zotero with its own windows" },
            // Nested suites: a full title starts with the OUTER describe's.
            { re: /^Weavero — context-menu handlers ignore bubbled submenu events /, why: "popups do not open in this runner window, or no bookmarkable row is selected" },
            { re: /^Weavero — items-list header contributes no intrinsic width its max-content width/, why: "the desktop keeps the runner's window hidden (measured on CI)" },
            { re: /^Weavero — column picker on macOS .* is not installed off macOS$/, why: "platform: the case is for non-macOS and the run is on macOS" },
            { re: /^Weavero -- Plugins Manager title bar is one row on every platform /, why: "platform: macOS, or a display that refuses to maximize" },
            { re: / \(Windows\)$/, why: "platform: Windows only" },
            { re: /^Weavero — tab-level undo choice a NEW main window gets the Edit hook/, why: "platform: Windows only, multi-main on" },
            { re: /^Weavero — window identity, lone window/, why: "needs the lone-window case" },
            { re: /^Weavero — View → Layout follows the tab .*note tab/, why: "version: note tabs (note-in-tab) need a Zotero that loads 'note' tabs" },
            // Unlisted until the 1.0.0-beta.1 CI, the first Ubuntu run of
            // these specs (2026-11-03).
            { re: /^Weavero — the background-restore focus guard ends /, why: "platform: the guard is WINNT-gated (bg-restore-guard.spec.js before)" },
            { re: /^Weavero — disabling Weavero from the Plugins Manager while the list holds focus/, why: "runner: the pointer rests over the manager's list (Ubuntu's xvfb), which holds the page changes by itself" },
            { re: /^Weavero — a drop highlight left by a lost drag clears \(WV-TEMP-133039\) replay of the recorded drags: .* the (drag ring records the session|ring notes Zotero's late dragleave)/, why: "version: Zotero 10.0.6 has no itemsView._setDropRow, nothing to record (local Zotero 10 run, 2026-11-03)" },
        ],
    };
    globalThis.wvT = wvT;

    // ---- the run's own hygiene and discipline ------------------------------

    // Quit trace. The runner's Zotero has QUIT mid-run in the tear-off spec
    // (no crash dump, no summary line, 2026-10-13: six times, while the user
    // was active at the machine; thirteen clean runs in between). Record
    // every quit request (with its JS stack) and every window close,
    // synchronously, to <temp>/wv-test-quit-trace.txt -- observers only: a
    // probe that wrapped window.close() changed the timing and the quit
    // stopped happening.
    let traceWrite = (line) => {};
    try {
        const tracePath = PathUtils.join(PathUtils.tempDir, "wv-test-quit-trace.txt");
        const write = (line) => {
            try {
                const f = Components.classes["@mozilla.org/file/local;1"].createInstance(Components.interfaces.nsIFile);
                f.initWithPath(tracePath);
                const os = Components.classes["@mozilla.org/network/file-output-stream;1"].createInstance(Components.interfaces.nsIFileOutputStream);
                os.init(f, 0x02 | 0x08 | 0x10, 0o644, 0);   // write | create | append
                const s = new Date().toISOString() + " " + line + "\n";
                os.write(s, s.length);
                os.close();
            } catch (e) {}
        };
        const stack = () => { try { return String(new Error().stack).split("\n").slice(1, 14).join(" | "); } catch (e) { return "?"; } };
        traceWrite = write;
        write("RUN START");
        for (const t of ["quit-application-requested", "quit-application-granted", "last-window-closing"]) {
            Services.obs.addObserver({ observe: (s, topic, data) => write("OBS " + topic + " data=" + data + " :: " + stack()) }, t);
        }
        Services.ww.registerNotification({
            observe: (subject, topic) => {
                if (topic !== "domwindowclosed") return;
                const w = /** @type {any} */ (subject);
                let d = "?";
                try { d = (w.document.documentElement.getAttribute("windowtype") || "") + " " + String(w.location && w.location.href).slice(0, 60); } catch (e) {}
                write("CLOSED " + d);
                // The process's memory then: the CI runners' Zotero ended with
                // no quit at all, at a window's close (2026-11-03, macOS every
                // run, Windows twice) -- a crash, or the system killing it.
                try {
                    ChromeUtils.requestProcInfo().then((i) => {
                        const kids = (i.children || []).reduce((n, c) => n + (c.memory || 0), 0);
                        write("MEM parent " + Math.round((i.memory || 0) / 1048576) + " MB, " + (i.children || []).length + " children " + Math.round(kids / 1048576) + " MB, main windows " + Zotero.getMainWindows().length);
                    }, () => {});
                } catch (e) {}
            },
        });
    } catch (e) {}

    before(async function () {
        // Zotero's OWN readiness, beyond the plugin's: on a fresh profile the
        // bundled files (translators, styles) install right after startup
        // with long DB writes, the main window's pane comes up on its own
        // promise, and the items tree loads after that. The first spec's
        // `saveTx` waited 20 s on the DB lock once the fixed 8 s startup
        // delay became a readiness wait (2026-10-08). Wait for all three.
        this.timeout(90000);
        // On a Zotero with its own windows: `this.skip()` in a spec's `before`
        // would come after its hooks had started, so the list is applied here.
        if (wvT.nativeWindows()) {
            const retired = (x) => wvT.NATIVE_RETIRED.some(re => re.test(x.fullTitle()));
            const walk = (s) => {
                if (retired(s)) {
                    s.pending = true;
                    for (const h of ["_beforeAll", "_afterAll", "_beforeEach", "_afterEach"]) { if (Array.isArray(s[h])) s[h].length = 0; }
                }
                for (const t of s.tests || []) { if (retired(t)) t.pending = true; }
                for (const c of s.suites || []) walk(c);
            };
            if (this.test && this.test.parent) walk(this.test.parent);
        }
        const Z = /** @type {any} */ (Zotero);
        try { await Z.Schema.schemaUpdatePromise; } catch (e) {}
        try { await Z.uiReadyPromise; } catch (e) {}
        try {
            const win = Zotero.getMainWindow();
            const iv = win && win.ZoteroPane && win.ZoteroPane.itemsView;
            if (iv && typeof iv.waitForLoad === "function") await iv.waitForLoad();
        } catch (e) {}
        // A no-op transaction: returns once no other transaction holds the DB.
        try { await Zotero.DB.executeTransaction(async () => {}); } catch (e) {}
        // The main window as wired, before any spec uses it.
        try { wvT.mainAtStart = wvT.wiringSnapshot(Zotero.getMainWindow()); } catch (e) {}
    });

    after(async function () {
        // Temp files the helpers created.
        for (const p of tempFiles.splice(0)) { try { await IOUtils.remove(p); } catch (e) {} }
    });

    // Memory growth, by test: the parent process's resident size after each
    // test, a line in the quit trace whenever it grew by 64 MB or more since
    // the last test ("MEMGROW +<delta> <now> MB :: <test>"). The CI runners'
    // Zotero reached 5-11 GB over a run (2026-11-03: Ubuntu beta 10.7 GB,
    // Windows' second half 7.9 GB, macOS 6 GB -- where a 7 GB runner killed
    // it, silently); which tests grow it is the question.
    let memLast = 0;
    afterEach(async function () {
        let now = 0;
        try { now = Math.round(((await ChromeUtils.requestProcInfo()).memory || 0) / 1048576); } catch (e) { return; }
        const d = now - memLast;
        if (memLast && d >= 64) {
            const t = this.currentTest;
            const line = "MEMGROW +" + d + " " + now + " MB :: " + (t ? t.fullTitle() : "?");
            try { Zotero.debug("[wv-test] " + line); } catch (e) {}
            traceWrite(line);
        }
        memLast = now;
    });

    // Zotero.crash() stays set for the session, and from then on every main
    // window opened stops at a startup-error dialog: a failed note save erased
    // from under a spec's editor read as 13 failures 60 tests later, from the
    // first second-window test on (2026-11-04). Say when it happened, once:
    // the suspect is this test, or the spec teardown just before it.
    let crashSeen = false;
    afterEach(function () {
        if (crashSeen || !Zotero.crashed) return;
        crashSeen = true;
        const t = this.currentTest;
        // Zotero.crash() logs what led to it and its own stack: the last entries.
        let why = "";
        try { why = (Zotero.getErrors(true) || []).slice(-6).map((e) => String(e).slice(0, 700)).join(" || "); } catch (e) {}
        const line = "ZOTERO CRASHED, first seen after: " + (t ? t.fullTitle() : "?") + " :: " + why;
        traceWrite(line);
        try { Zotero.debug("[wv-test] " + line); } catch (e) {}
        try { if (typeof globalThis.debug === "function") globalThis.debug("[wv-test] " + line); } catch (e) {}
    });

    // A retried attempt (wvT.ciRetries), logged as it ends: which test, which
    // attempt, how it went -- Zotero's runner prints "(passed on retry N)".
    afterEach(function () {
        // `currentRetry()` is public in Mocha, protected in its typings.
        const t = /** @type {any} */ (this.currentTest);
        let k = 0;
        try { k = t && typeof t.currentRetry === "function" ? t.currentRetry() : 0; } catch (e) {}
        if (!k) return;
        const title = t.fullTitle();
        if (wvT.retried.indexOf(title) < 0) wvT.retried.push(title);
        const line = "[wv-test] retry " + k + " (" + (t.state || "?") + "): " + title;
        try { Zotero.debug(line); } catch (e) {}
        try { if (typeof globalThis.debug === "function") globalThis.debug(line); } catch (e) {}
    });

    after(function () {
        // Every pending test must be on the allowlist: the suite used to skip
        // silently exactly when a regression removed what a spec needed.
        const root = this.test && this.test.parent;
        if (!root) return;
        const pending = [];
        const walk = (s) => {
            for (const t of s.tests || []) {
                let p = false;
                try { p = !!(t.pending || (typeof t.isPending === "function" && t.isPending())); } catch (e) {}
                if (p) pending.push(t.fullTitle());
            }
            for (const c of s.suites || []) walk(c);
        };
        walk(root);
        const nativeRetired = wvT.nativeWindows() ? wvT.NATIVE_RETIRED : [];
        const unlisted = pending.filter(title => !wvT.PENDING_ALLOWLIST.some(a => a.re.test(title)) && !nativeRetired.some(re => re.test(title)));
        // Into the scaffold's log (its `debug` channel), so a run's pending
        // tally is visible next to the pass/fail count.
        const line = "[wv-test] pending: " + pending.length + ", allowlisted: " + (pending.length - unlisted.length) + ", unlisted: " + unlisted.length
            + ", retried: " + wvT.retried.length;
        try { Zotero.debug(line); } catch (e) {}
        try { if (typeof globalThis.debug === "function") globalThis.debug(line); } catch (e) {}
        if (unlisted.length) {
            throw new Error("pending tests without an allowlisted reason (test/000-helpers.spec.js):\n  - "
                + unlisted.join("\n  - "));
        }
    });
})();

describe("Weavero — harness readiness", () => {
    it("the plugin loaded and its init settled before the suite started", () => {
        const Z = /** @type {any} */ (Zotero);
        assert.isOk(Z.Weavero && Z.Weavero.plugin, "Zotero.Weavero.plugin");
        assert.strictEqual(Z._weaveroReady, true, "Zotero._weaveroReady (index.ts raises it when init settles; the runner waits for it)");
        assert.isNotOk(Z._weaveroInitError, "init rejected: " + Z._weaveroInitError);
        assert.isOk(Z.Weavero.lib, "Zotero.Weavero.lib");
        assert.isFunction(globalThis.wvT && globalThis.wvT.absent, "the shared helpers are a global");
    });
});
